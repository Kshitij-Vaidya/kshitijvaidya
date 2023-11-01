#include <stdio.h>
#include <stdlib.h>
#include <math.h>
//1802B Codeforces: Settlement of Guinea Pigs
void main(void)
{
    //Accepting all data from the user
    int t; int n;
    int d[n]; int a[t];
    printf("Enter number of data sets: ");
    scanf("%d\n",&t);
    for(int i=1;i<=t;i++)
    {
        printf("Enter number of days for which we need to plan : ");
        scanf("%d\n",&n);
        for(int j=0;j<n;j++)
        {
            scanf("%d  ",d[j]);
        }
        a[i]=Aviaries(n,d[n]);
    }
}

int Aviaries(int x, int y[])
{
    //Block checks for the minimum number of aviaries that should be needed
    int N=0; //Number of guinea pigs
    int A=0; //Number of aviaries
    int t=0; int p=0;
    for(int k=0;k<x;k++)
    {
        p=k+1;
        if(y[k]==2)
        {
            t=k+1;
        }
        N=t-p-1;
        A+=(N/2+1);

    }

    return A;
}